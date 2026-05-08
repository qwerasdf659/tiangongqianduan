import { defineComponent, h } from 'vue';

export const IconMegaphone = defineComponent({
  name: 'IconMegaphone',
  props: {
    class: {
      type: String,
      default: ''
    }
  },
  setup(props, { attrs }) {
    return () => h(
      'svg',
      {
        viewBox: '0 0 20 20',
        
        class: `tiangong-icons ${props.class}`,
        ...attrs
      },
      [
        h('path', {"d": "M768 128L256 640l-64 192 192-64L896 256c0-70.7-57.3-128-128-128zM256 832H192v-64l448-448 64 64-448 448z", "fillRule": "evenodd"})
      ]
    );
  }
});
